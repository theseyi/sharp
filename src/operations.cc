#include <algorithm>
#include <tuple>
#include <memory>
#include <vips/vips8>

#include "common.h"
#include "operations.h"

using vips::VImage;
using vips::VError;

namespace sharp {

  /*
    Alpha composite src over dst with given gravity.
    Assumes alpha channels are already premultiplied and will be unpremultiplied after.
   */
  VImage Composite(VImage src, VImage dst, const int gravity) {
    if(IsInputValidForComposition(src, dst)) {
      // Enlarge overlay src, if required
      if (src.width() < dst.width() || src.height() < dst.height()) {
        // Calculate the (left, top) coordinates of the output image within the input image, applying the given gravity.
        int left;
        int top;
        std::tie(left, top) = CalculateCrop(dst.width(), dst.height(), src.width(), src.height(), gravity);
        // Embed onto transparent background
        std::vector<double> background { 0.0, 0.0, 0.0, 0.0 };
        src = src.embed(left, top, dst.width(), dst.height(), VImage::option()
          ->set("extend", VIPS_EXTEND_BACKGROUND)
          ->set("background", background)
        );
      }
      return CompositeImage(src, dst);
    }
    // If the input was not valid for composition the return the input image itself
    return dst;
  }


  VImage Composite(VImage src, VImage dst, const int x, const int y) {
    if(IsInputValidForComposition(src, dst)) {
      // Enlarge overlay src, if required
      if (src.width() < dst.width() || src.height() < dst.height()) {
        // Calculate the (left, top) coordinates of the output image within the input image, applying the given gravity.
        int left;
        int top;
        std::tie(left, top) = CalculateCrop(dst.width(), dst.height(), src.width(), src.height(), x, y);
        // Embed onto transparent background
        std::vector<double> background { 0.0, 0.0, 0.0, 0.0 };
        src = src.embed(left, top, dst.width(), dst.height(), VImage::option()
          ->set("extend", VIPS_EXTEND_BACKGROUND)
          ->set("background", background)
        );
      }
      return CompositeImage(src, dst);
    }
    // If the input was not valid for composition the return the input image itself
    return dst;
  }

  bool IsInputValidForComposition(VImage src, VImage dst) {
    using sharp::CalculateCrop;
    using sharp::HasAlpha;

    if (!HasAlpha(src)) {
      throw VError("Overlay image must have an alpha channel");
    }
    if (!HasAlpha(dst)) {
      throw VError("Image to be overlaid must have an alpha channel");
    }
    if (src.width() > dst.width() || src.height() > dst.height()) {
      throw VError("Overlay image must have same dimensions or smaller");
    }

    return true;
  }

  VImage CompositeImage(VImage src, VImage dst) {
    // Split src into non-alpha and alpha channels
    VImage srcWithoutAlpha = src.extract_band(0, VImage::option()->set("n", src.bands() - 1));
    VImage srcAlpha = src[src.bands() - 1] * (1.0 / 255.0);

    // Split dst into non-alpha and alpha channels
    VImage dstWithoutAlpha = dst.extract_band(0, VImage::option()->set("n", dst.bands() - 1));
    VImage dstAlpha = dst[dst.bands() - 1] * (1.0 / 255.0);

    //
    // Compute normalized output alpha channel:
    //
    // References:
    // - http://en.wikipedia.org/wiki/Alpha_compositing#Alpha_blending
    // - https://github.com/jcupitt/ruby-vips/issues/28#issuecomment-9014826
    //
    // out_a = src_a + dst_a * (1 - src_a)
    //                         ^^^^^^^^^^^
    //                            t0
    VImage t0 = srcAlpha.linear(-1.0, 1.0);
    VImage outAlphaNormalized = srcAlpha + dstAlpha * t0;

    //
    // Compute output RGB channels:
    //
    // Wikipedia:
    // out_rgb = (src_rgb * src_a + dst_rgb * dst_a * (1 - src_a)) / out_a
    //                                                ^^^^^^^^^^^
    //                                                    t0
    //
    // Omit division by `out_a` since `Compose` is supposed to output a
    // premultiplied RGBA image as reversal of premultiplication is handled
    // externally.
    //
    VImage outRGBPremultiplied = srcWithoutAlpha + dstWithoutAlpha * t0;

    // Combine RGB and alpha channel into output image:
    return outRGBPremultiplied.bandjoin(outAlphaNormalized * 255.0);
  }

  /*
    Cutout src over dst with given gravity.
   */
  VImage Cutout(VImage mask, VImage dst, const int gravity) {
    using sharp::CalculateCrop;
    using sharp::HasAlpha;
    using sharp::MaximumImageAlpha;

    bool maskHasAlpha = HasAlpha(mask);

    if (!maskHasAlpha && mask.bands() > 1) {
      throw VError("Overlay image must have an alpha channel or one band");
    }
    if (!HasAlpha(dst)) {
      throw VError("Image to be overlaid must have an alpha channel");
    }
    if (mask.width() > dst.width() || mask.height() > dst.height()) {
      throw VError("Overlay image must have same dimensions or smaller");
    }

    // Enlarge overlay mask, if required
    if (mask.width() < dst.width() || mask.height() < dst.height()) {
      // Calculate the (left, top) coordinates of the output image within the input image, applying the given gravity.
      int left;
      int top;
      std::tie(left, top) = CalculateCrop(dst.width(), dst.height(), mask.width(), mask.height(), gravity);
      // Embed onto transparent background
      std::vector<double> background { 0.0, 0.0, 0.0, 0.0 };
      mask = mask.embed(left, top, dst.width(), dst.height(), VImage::option()
              ->set("extend", VIPS_EXTEND_BACKGROUND)
              ->set("background", background)
      );
    }

    // we use the mask alpha if it has alpha
    if(maskHasAlpha) {
      mask = mask.extract_band(mask.bands() - 1, VImage::option()->set("n", 1));;
    }

    // Split dst into an optional alpha
    VImage dstAlpha = dst.extract_band(dst.bands() - 1, VImage::option()->set("n", 1));

    // we use the dst non-alpha
    dst = dst.extract_band(0, VImage::option()->set("n", dst.bands() - 1));

    // the range of the mask and the image need to match .. one could be
    // 16-bit, one 8-bit
    int dstMax = MaximumImageAlpha(dst.interpretation());
    int maskMax = MaximumImageAlpha(mask.interpretation());

    // combine the new mask and the existing alpha ... there are
    // many ways of doing this, mult is the simplest
    mask = dstMax * ((mask / maskMax) * (dstAlpha / dstMax));

    // append the mask to the image data ... the mask might be float now,
    // we must cast the format down to match the image data
    return dst.bandjoin(mask.cast(dst.format()));
  }

  /*
   * Stretch luminance to cover full dynamic range.
   */
  VImage Normalize(VImage image) {
    // Get original colourspace
    VipsInterpretation typeBeforeNormalize = image.interpretation();
    if (typeBeforeNormalize == VIPS_INTERPRETATION_RGB) {
      typeBeforeNormalize = VIPS_INTERPRETATION_sRGB;
    }
    // Convert to LAB colourspace
    VImage lab = image.colourspace(VIPS_INTERPRETATION_LAB);
    // Extract luminance
    VImage luminance = lab[0];
    // Find luminance range
    VImage stats = luminance.stats();
    double min = stats(0, 0)[0];
    double max = stats(1, 0)[0];
    if (min != max) {
      // Extract chroma
      VImage chroma = lab.extract_band(1, VImage::option()->set("n", 2));
      // Calculate multiplication factor and addition
      double f = 100.0 / (max - min);
      double a = -(min * f);
      // Scale luminance, join to chroma, convert back to original colourspace
      VImage normalized = luminance.linear(f, a).bandjoin(chroma).colourspace(typeBeforeNormalize);
      // Attach original alpha channel, if any
      if (HasAlpha(image)) {
        // Extract original alpha channel
        VImage alpha = image[image.bands() - 1];
        // Join alpha channel to normalised image
        return normalized.bandjoin(alpha);
      } else {
        return normalized;
      }
    }
    return image;
  }

  /*
   * Gamma encoding/decoding
   */
  VImage Gamma(VImage image, double const exponent) {
    if (HasAlpha(image)) {
      // Separate alpha channel
      VImage imageWithoutAlpha = image.extract_band(0,
        VImage::option()->set("n", image.bands() - 1));
      VImage alpha = image[image.bands() - 1];
      return imageWithoutAlpha.gamma(VImage::option()->set("exponent", exponent)).bandjoin(alpha);
    } else {
      return image.gamma(VImage::option()->set("exponent", exponent));
    }
  }

  /*
   * Gaussian blur. Use sigma of -1.0 for fast blur.
   */
  VImage Blur(VImage image, double const sigma) {
    if (sigma == -1.0) {
      // Fast, mild blur - averages neighbouring pixels
      VImage blur = VImage::new_matrixv(3, 3,
        1.0, 1.0, 1.0,
        1.0, 1.0, 1.0,
        1.0, 1.0, 1.0);
      blur.set("scale", 9.0);
      return image.conv(blur);
    } else {
      // Slower, accurate Gaussian blur
      return image.gaussblur(sigma);
    }
  }

  /*
   * Convolution with a kernel.
   */
  VImage Convolve(VImage image, int const width, int const height,
    double const scale, double const offset,
    std::unique_ptr<double[]> const &kernel_v
  ) {
    VImage kernel = VImage::new_from_memory(
      kernel_v.get(),
      width * height * sizeof(double),
      width,
      height,
      1,
      VIPS_FORMAT_DOUBLE);
    kernel.set("scale", scale);
    kernel.set("offset", offset);

    return image.conv(kernel);
  }

  /*
   * Sharpen flat and jagged areas. Use sigma of -1.0 for fast sharpen.
   */
  VImage Sharpen(VImage image, double const sigma, double const flat, double const jagged) {
    if (sigma == -1.0) {
      // Fast, mild sharpen
      VImage sharpen = VImage::new_matrixv(3, 3,
        -1.0, -1.0, -1.0,
        -1.0, 32.0, -1.0,
        -1.0, -1.0, -1.0);
      sharpen.set("scale", 24.0);
      return image.conv(sharpen);
    } else {
      // Slow, accurate sharpen in LAB colour space, with control over flat vs jagged areas
      VipsInterpretation colourspaceBeforeSharpen = image.interpretation();
      if (colourspaceBeforeSharpen == VIPS_INTERPRETATION_RGB) {
        colourspaceBeforeSharpen = VIPS_INTERPRETATION_sRGB;
      }
      return image.sharpen(
        VImage::option()->set("sigma", sigma)->set("m1", flat)->set("m2", jagged)
      ).colourspace(colourspaceBeforeSharpen);
    }
  }

  /*
    Calculate crop area based on image entropy
  */
  std::tuple<int, int> EntropyCrop(VImage image, int const outWidth, int const outHeight) {
    int left = 0;
    int top = 0;
    int const inWidth = image.width();
    int const inHeight = image.height();
    if (inWidth > outWidth) {
      // Reduce width by repeated removing slices from edge with lowest entropy
      int width = inWidth;
      double leftEntropy = 0.0;
      double rightEntropy = 0.0;
      // Max width of each slice
      int const maxSliceWidth = static_cast<int>(ceil((inWidth - outWidth) / 8.0));
      while (width > outWidth) {
        // Width of current slice
        int const slice = std::min(width - outWidth, maxSliceWidth);
        if (leftEntropy == 0.0) {
          // Update entropy of left slice
          leftEntropy = Entropy(image.extract_area(left, 0, slice, inHeight));
        }
        if (rightEntropy == 0.0) {
          // Update entropy of right slice
          rightEntropy = Entropy(image.extract_area(width - slice - 1, 0, slice, inHeight));
        }
        // Keep slice with highest entropy
        if (leftEntropy >= rightEntropy) {
          // Discard right slice
          rightEntropy = 0.0;
        } else {
          // Discard left slice
          leftEntropy = 0.0;
          left = left + slice;
        }
        width = width - slice;
      }
    }
    if (inHeight > outHeight) {
      // Reduce height by repeated removing slices from edge with lowest entropy
      int height = inHeight;
      double topEntropy = 0.0;
      double bottomEntropy = 0.0;
      // Max height of each slice
      int const maxSliceHeight = static_cast<int>(ceil((inHeight - outHeight) / 8.0));
      while (height > outHeight) {
        // Height of current slice
        int const slice = std::min(height - outHeight, maxSliceHeight);
        if (topEntropy == 0.0) {
          // Update entropy of top slice
          topEntropy = Entropy(image.extract_area(0, top, inWidth, slice));
        }
        if (bottomEntropy == 0.0) {
          // Update entropy of bottom slice
          bottomEntropy = Entropy(image.extract_area(0, height - slice - 1, inWidth, slice));
        }
        // Keep slice with highest entropy
        if (topEntropy >= bottomEntropy) {
          // Discard bottom slice
          bottomEntropy = 0.0;
        } else {
          // Discard top slice
          topEntropy = 0.0;
          top = top + slice;
        }
        height = height - slice;
      }
    }
    return std::make_tuple(left, top);
  }

  /*
    Calculate the Shannon entropy for an image
  */
  double Entropy(VImage image) {
    return image.hist_find().hist_entropy();
  }

  /*
    Insert a tile cache to prevent over-computation of any previous operations in the pipeline
  */
  VImage TileCache(VImage image, double const factor) {
    int tile_width;
    int tile_height;
    int scanline_count;
    vips_get_tile_size(image.get_image(), &tile_width, &tile_height, &scanline_count);
    double const need_lines = 1.2 * scanline_count / factor;
    return image.tilecache(VImage::option()
      ->set("tile_width", image.width())
      ->set("tile_height", 10)
      ->set("max_tiles", static_cast<int>(round(1.0 + need_lines / 10.0)))
      ->set("access", VIPS_ACCESS_SEQUENTIAL)
      ->set("threaded", TRUE)
    );
  }

  VImage Threshold(VImage image, double const threshold, bool const thresholdGrayscale) {
    if(!thresholdGrayscale) {
      return image >= threshold;
    }
    return image.colourspace(VIPS_INTERPRETATION_B_W) >= threshold;
  }

}  // namespace sharp
